/**
 * SparkLab — the hero application: a synthetic confocal FRAME-SCAN (x–y–t)
 * movie and a real detection pass (src/shared/framescan.ts) run on it.
 * Acquisition parameters match Gabriel's setup; the data are synthetic.
 */
import { DX_NATIVE, detectSteps, type Detection, type FrameSeries, type SparkDet, type StepInfo } from '../../shared/framescan';
import { DEFAULT_SEED, series, fileName, paintRaw, paintPlane } from './analysis';
import type { Ctx, AppInstance } from './wm';

export interface SparkLabApi extends AppInstance { run(animated?: boolean, pause?: number): void }

type View = 'raw' | 'dff' | 'max' | 'f0';
const S = 4;                 // overlay oversampling (overlay px per data px)
const PLAY_MS = 58.2;        // wall-clock ms per frame → 0.1× real time
const STEP_KEYS: StepInfo['key'][] = ['mask', 'f0', 'dff', 'threshold', 'components'];
const STEP_LABEL: Record<StepInfo['key'], string> = {
  mask: 'Cell mask', f0: 'Baseline F₀', dff: 'ΔF/F₀ + smoothing', threshold: 'Noise σ · threshold', components: '3-D components',
};

export function mountSparkLab(body: HTMLElement, ctx: Ctx): SparkLabApi {
  body.classList.add('sl');
  body.innerHTML = `
    <div class="sl-tools" role="toolbar" aria-label="SparkLab tools">
      <button class="btn btn-primary" data-act="run" type="button"><svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg>Run detection</button>
      <button class="btn" data-act="regen" type="button"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M10 6a4 4 0 1 1-1.2-2.85M10 1.5v2.8H7.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Regenerate</button>
      <span class="sl-sep" aria-hidden="true"></span>
      <div class="seg" role="radiogroup" aria-label="Image view">
        <button type="button" role="radio" aria-checked="true" data-view="raw">F</button>
        <button type="button" role="radio" aria-checked="false" data-view="dff">ΔF/F₀</button>
        <button type="button" role="radio" aria-checked="false" data-view="max">Max proj.</button>
      </div>
      <div class="seg" role="radiogroup" aria-label="Look-up table">
        <button type="button" role="radio" aria-checked="true" data-lut="green">Green</button>
        <button type="button" role="radio" aria-checked="false" data-lut="fire">Fire</button>
      </div>
      <span class="sl-file mono" aria-live="polite"></span>
    </div>
    <p class="sl-honest"><span class="led" aria-hidden="true"></span><span><strong>Synthetic frame-scan (x–y–t)</strong> · Fluo-4 · human atrial cardiomyocyte model · DX 0.060 µm/px · DT 5.82 ms — demonstration of an analysis workflow, not experimental data</span></p>
    <div class="sl-main">
      <figure class="sl-fig">
        <div class="sl-stage" tabindex="0" aria-describedby="sl-stage-help">
          <canvas class="sl-img" role="img" aria-label="Synthetic confocal frame-scan movie of part of a cardiomyocyte. Bright transient spots are simulated calcium sparks."></canvas>
          <canvas class="sl-ovl" aria-hidden="true"></canvas>
          <span class="sl-time mono" aria-hidden="true"></span>
          <span class="sl-vlabel mono" aria-hidden="true"></span>
          <span class="sl-bar mono" aria-hidden="true"><i></i>5 µm</span>
        </div>
        <p id="sl-stage-help" class="vh">Space plays or pauses the movie; left and right arrows step one frame.</p>
        <div class="sl-transport">
          <button type="button" class="sl-play" data-act="play" aria-pressed="false" aria-label="Play movie"><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path class="i-play" d="M2 1l7 4-7 4z" fill="currentColor"/><path class="i-pause" d="M2 1h2.2v8H2zM5.8 1H8v8H5.8z" fill="currentColor"/></svg></button>
          <input class="sl-scrub" type="range" min="0" value="0" step="1" aria-label="Frame" />
          <span class="sl-clock mono" aria-live="off"></span>
        </div>
        <figcaption class="mono"><span class="sl-meta"></span>
          <span class="sl-legend"><i class="lg-on"></i>active <i class="lg-all"></i>all events <i class="lg-mask"></i>cell mask <i class="lg-miss"></i>missed</span></figcaption>
      </figure>
      <aside class="sl-aside">
        <ol class="sl-steps mono" aria-label="Detection pipeline">${STEP_KEYS.map((k, i) => `<li data-step="${k}"><b>${i + 1}</b><span><em>${STEP_LABEL[k]}</em><small>—</small></span><time></time></li>`).join('')}</ol>
        <figure class="sl-tracefig">
          <figcaption class="mono"><span class="sl-trace-t">ROI ΔF/F₀</span><span class="sl-trace-m"></span></figcaption>
          <canvas class="sl-trace" width="520" height="210" role="img" aria-label="ΔF/F0 time trace of the selected spark's region of interest"></canvas>
        </figure>
      </aside>
    </div>
    <div class="sl-results">
      <div class="sl-tablewrap well">
        <table class="sl-table">
          <caption class="vh">Detected sparks — select a row to jump to its peak frame</caption>
          <thead><tr><th scope="col">#</th><th scope="col">t<sub>peak</sub> ms</th><th scope="col">x, y µm</th><th scope="col">ΔF/F₀</th><th scope="col">FWHM µm</th><th scope="col">FDHM ms</th><th scope="col">TTP ms</th><th scope="col">GT</th></tr></thead>
          <tbody></tbody>
        </table>
        <p class="sl-empty">Press <b>Run detection</b> to analyse the movie.</p>
      </div>
      <div class="sl-side">
        <dl class="sl-stats mono"></dl>
        <div class="sl-hist well"><div class="hist-bars" role="img" aria-label="Histogram of spark amplitudes"></div><div class="hist-ax mono" aria-hidden="true"><span style="left:0">0</span><span style="left:31.25%">0.5</span><span style="left:62.5%">1.0</span><span style="left:93.75%">1.5</span><span class="hx-u">ΔF/F₀</span></div></div>
      </div>
    </div>
    <p class="vh" aria-live="polite" data-live></p>`;

  const $ = <T extends Element>(s: string) => body.querySelector(s) as T;
  const imgC = $<HTMLCanvasElement>('.sl-img'), ovlC = $<HTMLCanvasElement>('.sl-ovl');
  const img = imgC.getContext('2d')!, ovl = ovlC.getContext('2d')!;
  const stage = $<HTMLElement>('.sl-stage');
  const tbody = $<HTMLTableSectionElement>('tbody');
  const stats = $<HTMLDListElement>('.sl-stats');
  const hist = $<HTMLElement>('.hist-bars');
  const live = $<HTMLElement>('[data-live]');
  const runBtn = $<HTMLButtonElement>('[data-act="run"]');
  const playBtn = $<HTMLButtonElement>('[data-act="play"]');
  const scrub = $<HTMLInputElement>('.sl-scrub');
  const clock = $<HTMLElement>('.sl-clock');
  const timeEl = $<HTMLElement>('.sl-time');
  const vlabel = $<HTMLElement>('.sl-vlabel');
  const barEl = $<HTMLElement>('.sl-bar i');
  const traceC = $<HTMLCanvasElement>('.sl-trace');
  const tr = traceC.getContext('2d')!;
  const thrC = document.createElement('canvas');
  const thrX = thrC.getContext('2d')!;

  let seed = DEFAULT_SEED, s: FrameSeries, det: Detection | null = null, partial: Partial<Detection> = {};
  let frame = 0, playing = false, view: View = 'raw', userView: View = 'raw', lutName = 'green';
  let sel = -1, showMask = false, showThr = false, showComp = false, running = false;
  let raf = 0, acc = 0, last = 0, timer = 0, maskPath: Path2D | null = null;

  const N = () => s.width * s.height;

  // ------------------------------------------------------------ drawing
  function drawImage() {
    const W = s.width, H = s.height;
    const p = det ?? partial;
    if (view === 'dff' && p.dff) paintPlane(img, p.dff.subarray(frame * N(), (frame + 1) * N()), W, H, -0.08, 0.6, lutName, 0.8);
    else if (view === 'max' && p.maxProj) paintPlane(img, p.maxProj, W, H, 0.02, 0.75, lutName, 0.8);
    else if (view === 'f0' && p.F0) paintPlane(img, p.F0, W, H, s.baseline * 0.3, s.baseline * 2.7, lutName, 1.05);
    else paintRaw(img, s, frame, lutName);
    vlabel.textContent = view === 'raw' ? 'F · raw' : view === 'dff' ? 'ΔF/F₀ · smoothed' : view === 'max' ? 'max projection of ΔF/F₀ over t' : 'F₀ · temporal median';
  }

  function buildMaskPath(mask: Uint8Array) {
    const W = s.width, H = s.height, p = new Path2D();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (x === 0 || !mask[y * W + x - 1]) { p.moveTo(x * S, y * S); p.lineTo(x * S, (y + 1) * S); }
      if (x === W - 1 || !mask[y * W + x + 1]) { p.moveTo((x + 1) * S, y * S); p.lineTo((x + 1) * S, (y + 1) * S); }
      if (y === 0 || !mask[(y - 1) * W + x]) { p.moveTo(x * S, y * S); p.lineTo((x + 1) * S, y * S); }
      if (y === H - 1 || !mask[(y + 1) * W + x]) { p.moveTo(x * S, (y + 1) * S); p.lineTo((x + 1) * S, (y + 1) * S); }
    }
    return p;
  }

  function tag(text: string, x: number, y: number, bg: string, fg = '#111') {
    ovl.font = '600 20px "IBM Plex Mono", monospace';
    const w = ovl.measureText(text).width + 12;
    const tx = Math.min(ovlC.width - w - 2, Math.max(2, x)), ty = Math.max(24, y);
    ovl.fillStyle = bg; ovl.fillRect(tx, ty - 22, w, 26);
    ovl.fillStyle = fg; ovl.fillText(text, tx + 6, ty - 2);
  }

  function drawOverlay() {
    const W = s.width, H = s.height;
    ovl.clearRect(0, 0, ovlC.width, ovlC.height);
    if (showMask && maskPath) {
      ovl.save();
      ovl.strokeStyle = 'rgba(150, 215, 255, .7)'; ovl.lineWidth = 2; ovl.setLineDash([8, 6]);
      ovl.stroke(maskPath);
      ovl.restore();
    }
    const p = det ?? partial;
    if (showThr && p.dff && p.noiseScale && p.core && p.sigma !== undefined) {
      // voxels of the current frame above the low hysteresis threshold
      const im = thrX.createImageData(W, H), off = frame * N();
      for (let i = 0; i < N(); i++) {
        if (p.core[i] && p.dff[off + i] > (p.median ?? 0) + 2.5 * p.sigma * p.noiseScale[i]) {
          im.data[i * 4] = 255; im.data[i * 4 + 1] = 120; im.data[i * 4 + 2] = 40; im.data[i * 4 + 3] = 170;
        }
      }
      thrX.putImageData(im, 0, 0);
      ovl.imageSmoothingEnabled = false;
      ovl.drawImage(thrC, 0, 0, W * S, H * S);
    }
    if (!det || !showComp) return;
    const dx = s.dx;
    for (const d of det.sparks) {
      const cx = (d.x + 0.5) * S, cy = (d.y + 0.5) * S;
      const r = Math.max(26, (d.fwhm_um / dx / 2 + 4) * S);
      const active = frame >= d.f0 && frame <= d.f1, on = d.id === sel;
      const col = d.matched >= 0 ? '#ff6a2b' : '#ffd23d';
      ovl.setLineDash(d.matched >= 0 ? [] : [6, 5]);
      if (active || on) {
        ovl.lineWidth = on ? 3.5 : 3;
        ovl.strokeStyle = on ? '#ffffff' : col;
        ovl.beginPath(); ovl.arc(cx, cy, r, 0, Math.PI * 2); ovl.stroke();
        if (active) {
          // ticks marking the peak frame
          if (frame === d.peakFrame) for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + Math.PI / 4;
            ovl.beginPath(); ovl.moveTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); ovl.lineTo(cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14)); ovl.stroke();
          }
          tag(`#${d.id}${frame === d.peakFrame ? ` peak ${d.amp.toFixed(2)}` : ''}`, cx - r * 0.7, cy - r - 6, on ? '#ffffff' : col);
        } else tag(`#${d.id}`, cx - r * 0.7, cy - r - 6, 'rgba(255,255,255,.85)');
        if (on) {
          // ROI used for the ΔF/F0 trace (5 × 5 px)
          ovl.setLineDash([]); ovl.lineWidth = 2; ovl.strokeStyle = '#ffffff';
          ovl.strokeRect((d.px - 2) * S, (d.py - 2) * S, 5 * S, 5 * S);
        }
      } else {
        ovl.lineWidth = 1.5;
        ovl.strokeStyle = 'rgba(255,255,255,.28)';
        ovl.beginPath(); ovl.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ovl.stroke();
        ovl.font = '500 16px "IBM Plex Mono", monospace';
        ovl.fillStyle = 'rgba(255,255,255,.45)';
        ovl.fillText(String(d.id), cx + r * 0.55, cy - r * 0.55);
      }
    }
    ovl.setLineDash([4, 5]); ovl.lineWidth = 2; ovl.strokeStyle = 'rgba(255,255,255,.75)';
    for (const m of det.missed) {
      const cx = (m.x + 0.5) * S, cy = (m.y + 0.5) * S;
      ovl.beginPath(); ovl.arc(cx, cy, 30, 0, Math.PI * 2); ovl.stroke();
      ovl.font = '500 16px "IBM Plex Mono", monospace'; ovl.fillStyle = 'rgba(255,255,255,.8)';
      ovl.fillText('missed', cx + 34, cy + 5);
    }
    ovl.setLineDash([]);
  }

  function drawTrace() {
    const Wc = traceC.width, Hc = traceC.height;
    tr.clearRect(0, 0, Wc, Hc);
    const d = det?.sparks.find((x) => x.id === sel);
    const meta = $<HTMLElement>('.sl-trace-m'), title = $<HTMLElement>('.sl-trace-t');
    tr.font = '500 17px "IBM Plex Mono", monospace';
    if (!d) {
      title.textContent = 'ROI ΔF/F₀';
      meta.textContent = '';
      tr.fillStyle = '#7f8a83';
      tr.fillText(det ? 'select a spark in the table' : 'run detection first', 20, Hc / 2 + 6);
      return;
    }
    title.textContent = `Spark #${d.id} · ROI 0.6 × 0.6 µm`;
    meta.textContent = `FDHM ${d.fdhm_ms.toFixed(0)} ms`;
    const fa = Math.max(0, d.peakFrame - 14), fb = Math.min(s.frames - 1, d.peakFrame + 36);
    const lo = -0.15, hi = Math.max(0.4, d.amp * 1.25);
    const L = 54, R = 10, T = 12, B = 30;
    const X = (f: number) => L + ((f - fa) / (fb - fa)) * (Wc - L - R);
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (Hc - T - B);
    tr.strokeStyle = '#26302a'; tr.lineWidth = 1; tr.fillStyle = '#7f8a83';
    const stepV = hi > 1 ? 0.5 : 0.2;
    for (let v = 0; v <= hi; v += stepV) {
      tr.beginPath(); tr.moveTo(L, Y(v) + 0.5); tr.lineTo(Wc - R, Y(v) + 0.5); tr.stroke();
      tr.fillText(v.toFixed(1), 8, Y(v) + 6);
    }
    for (let ms = 0; ms <= (fb - fa) * s.dt; ms += 100) {
      const x = L + (ms / ((fb - fa) * s.dt)) * (Wc - L - R);
      tr.fillText(`${ms}`, x - 8, Hc - 8);
    }
    tr.fillText('ms', Wc - 34, Hc - 8);
    // half-max band + FDHM bracket
    tr.strokeStyle = 'rgba(255,210,61,.7)'; tr.setLineDash([5, 5]);
    tr.beginPath(); tr.moveTo(L, Y(d.amp / 2)); tr.lineTo(Wc - R, Y(d.amp / 2)); tr.stroke();
    tr.setLineDash([]);
    // playhead
    if (frame >= fa && frame <= fb) {
      tr.strokeStyle = 'rgba(150,215,255,.8)'; tr.lineWidth = 2;
      tr.beginPath(); tr.moveTo(X(frame), T); tr.lineTo(X(frame), Hc - B); tr.stroke();
    }
    // trace (frame samples, 5.82 ms apart)
    tr.strokeStyle = '#8af7b5'; tr.lineWidth = 2.5; tr.lineJoin = 'round';
    tr.beginPath();
    for (let f = fa; f <= fb; f++) { const x = X(f), y = Y(d.trace[f]); f === fa ? tr.moveTo(x, y) : tr.lineTo(x, y); }
    tr.stroke();
    tr.fillStyle = '#8af7b5';
    for (let f = fa; f <= fb; f++) { tr.beginPath(); tr.arc(X(f), Y(d.trace[f]), 2.6, 0, Math.PI * 2); tr.fill(); }
    tr.fillStyle = '#ff6a2b';
    tr.beginPath(); tr.arc(X(d.peakFrame), Y(d.amp), 6, 0, Math.PI * 2); tr.fill();
    tr.fillStyle = '#e9efe9';
    tr.fillText(`ΔF/F₀ ${d.amp.toFixed(2)}`, Math.min(Wc - 150, X(d.peakFrame) + 12), Y(d.amp) + 6);
  }

  function setFrame(f: number, redrawImage = true) {
    frame = Math.max(0, Math.min(s.frames - 1, f));
    scrub.value = String(frame);
    const t = (frame * s.dt).toFixed(1);
    timeEl.textContent = `t = ${t} ms`;
    clock.textContent = `frame ${String(frame + 1).padStart(3, ' ')}/${s.frames} · t = ${t} ms`;
    if (redrawImage) drawImage();
    drawOverlay();
    if (det && sel > 0) drawTrace();
  }

  // ------------------------------------------------------------ playback
  function setPlaying(on: boolean) {
    playing = on;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pause movie' : 'Play movie');
    cancelAnimationFrame(raf);
    if (!on) return;
    last = performance.now(); acc = 0;
    const tick = (now: number) => {
      acc += Math.min(250, now - last); last = now;
      if (acc >= PLAY_MS) {
        const n = Math.floor(acc / PLAY_MS); acc -= n * PLAY_MS;
        setFrame((frame + n) % s.frames);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ results
  const fmt = (v: number, p: number) => (Number.isFinite(v) ? v.toFixed(p) : '—');
  function fill() {
    if (!det) return;
    const sp = det.sparks;
    tbody.innerHTML = sp.map((d) => `<tr data-id="${d.id}" tabindex="0" aria-selected="${d.id === sel}">
      <td>${d.id}</td><td>${d.tPeak_ms.toFixed(1)}</td><td>${d.x_um.toFixed(1)}, ${d.y_um.toFixed(1)}</td>
      <td><b>${d.amp.toFixed(2)}</b></td><td>${fmt(d.fwhm_um, 2)}</td><td>${fmt(d.fdhm_ms, 0)}</td><td>${fmt(d.ttp_ms, 0)}</td>
      <td>${d.matched >= 0 ? '<span class="gt ok" title="Matches an injected spark">✓</span>' : '<span class="gt fp" title="No injected spark here: false positive">FP</span>'}</td></tr>`).join('');
    body.querySelector('.sl-empty')!.classList.toggle('is-hidden', sp.length > 0);
    const mean = (f: (d: SparkDet) => number) => (sp.length ? sp.reduce((a, d) => a + f(d), 0) / sp.length : NaN);
    stats.innerHTML = `
      <div class="big"><dt>sparks detected</dt><dd>${sp.length}</dd></div>
      <div class="big"><dt>recall vs injected</dt><dd>${det.found}<small>/${det.injected}</small> <small class="fp">${det.falsePos} FP</small></dd></div>
      <div><dt>frequency</dt><dd>${det.frequency.toFixed(2)} <small>/100 µm²·s</small></dd></div>
      <div><dt>noise σ (MAD)</dt><dd>${det.sigma.toFixed(3)} <small>ΔF/F₀</small></dd></div>
      <div><dt>mean ΔF/F₀ · FWHM</dt><dd>${fmt(mean((d) => d.amp), 2)} · ${fmt(mean((d) => d.fwhm_um), 2)} µm</dd></div>
      <div><dt>mean FDHM · area</dt><dd>${fmt(mean((d) => d.fdhm_ms), 0)} ms · ${det.maskArea_um2.toFixed(0)} µm²</dd></div>`;
    drawHist(sp.map((d) => d.amp));
  }

  function drawHist(a: number[]) {
    const bins = 16, max = 1.6;
    const c = new Array(bins).fill(0);
    for (const v of a) c[Math.min(bins - 1, Math.max(0, Math.floor((v / max) * bins)))]++;
    const top = Math.max(3, ...c);
    hist.innerHTML = c.map((k) => `<span style="height:${(k / top) * 100}%">${k ? `<b>${k}</b>` : ''}</span>`).join('');
    hist.setAttribute('aria-label', `Histogram of spark amplitudes: ${a.length} sparks in bins of ${(max / bins).toFixed(1)} ΔF/F0`);
  }

  function select(id: number, jump: boolean) {
    sel = id;
    tbody.querySelectorAll('tr').forEach((r) => r.setAttribute('aria-selected', String(Number(r.dataset.id) === id)));
    const d = det?.sparks.find((x) => x.id === id);
    if (d && jump) {
      setPlaying(false);
      setFrame(d.peakFrame);
      live.textContent = `Spark ${d.id}: peak at ${d.tPeak_ms.toFixed(1)} ms, ΔF/F0 ${d.amp.toFixed(2)}, FWHM ${d.fwhm_um.toFixed(2)} µm, FDHM ${d.fdhm_ms.toFixed(0)} ms.`;
    } else drawOverlay();
    drawTrace();
  }

  /** frame with the largest smoothed ΔF/F0 (sparse scan) — shown while the pipeline runs */
  function brightestFrame(dff: Float32Array) {
    let bf = 0, bv = -Infinity;
    for (let f = 0; f < s.frames; f++) {
      const off = f * N();
      for (let i = 0; i < N(); i += 3) if (dff[off + i] > bv) { bv = dff[off + i]; bf = f; }
    }
    return bf;
  }

  // ------------------------------------------------------------ pipeline
  const stepEl = (k: string) => body.querySelector(`[data-step="${k}"]`) as HTMLElement;
  function resetSteps() {
    for (const k of STEP_KEYS) {
      const li = stepEl(k);
      li.classList.remove('is-done', 'is-active');
      li.querySelector('small')!.textContent = '—';
      li.querySelector('time')!.textContent = '';
    }
  }
  function setViewBtns() {
    body.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.view === view));
      b.disabled = b.dataset.view !== 'raw' && !det;
    });
  }

  function regenerate() {
    clearTimeout(timer); setPlaying(false);
    s = series(seed);
    imgC.width = s.width; imgC.height = s.height;
    ovlC.width = s.width * S; ovlC.height = s.height * S;
    thrC.width = s.width; thrC.height = s.height;
    stage.style.aspectRatio = `${s.width} / ${s.height}`;
    barEl.style.width = `${(5 / (s.width * s.dx)) * 100}%`;
    scrub.max = String(s.frames - 1);
    $<HTMLElement>('.sl-meta').textContent = `frame-scan x–y–t · ${s.width}×${s.height} px · ${s.frames} frames @ ${s.dt.toFixed(2)} ms · ${s.dx.toFixed(3)} µm/px (2×2 binned from ${DX_NATIVE.toFixed(3)})`;
    det = null; partial = {}; sel = -1; showMask = showThr = showComp = false; maskPath = null; running = false;
    view = 'raw'; userView = 'raw'; setViewBtns();
    tbody.innerHTML = '';
    body.querySelector('.sl-empty')!.classList.remove('is-hidden');
    stats.innerHTML = `<div class="big"><dt>sparks detected</dt><dd>—</dd></div><div class="big"><dt>recall vs injected</dt><dd>—</dd></div>
      <div><dt>status</dt><dd>awaiting run</dd></div><div><dt>series</dt><dd>${s.frames} frames · ${((s.frames * s.dt) / 1000).toFixed(2)} s</dd></div>`;
    drawHist([]);
    resetSteps();
    runBtn.disabled = false;
    $<HTMLElement>('.sl-file').textContent = fileName(seed);
    setFrame(0);
    drawTrace();
  }

  function run(animated = !ctx.reduced, pause = 380) {
    if (running) return;
    clearTimeout(timer);
    running = true; runBtn.disabled = true;
    det = null; partial = {}; sel = -1; showMask = showThr = showComp = false;
    resetSteps(); setViewBtns(); drawTrace();
    tbody.innerHTML = '';
    stats.innerHTML = `<div class="big"><dt>sparks detected</dt><dd>…</dd></div><div class="big"><dt>recall vs injected</dt><dd>…</dd></div>
      <div><dt>status</dt><dd>analysing</dd></div><div><dt>series</dt><dd>${s.frames} frames</dd></div>`;
    const gen = detectSteps(s);
    let idx = 0;
    const apply = (st: StepInfo) => {
      Object.assign(partial, st.partial);
      const li = stepEl(st.key);
      li.classList.remove('is-active'); li.classList.add('is-done');
      li.querySelector('small')!.textContent = st.detail;
      li.querySelector('time')!.textContent = `${Math.max(1, Math.round(st.ms))} ms`;
      if (st.key === 'mask' && partial.mask) { maskPath = buildMaskPath(partial.mask); showMask = true; }
      if (animated) {
        if (st.key === 'f0') view = 'f0';
        if (st.key === 'dff') view = 'dff';
        if (st.key === 'threshold') showThr = true;
        if (st.key === 'components') { showThr = false; }
      }
    };
    const advance = () => {
      if (idx < STEP_KEYS.length) stepEl(STEP_KEYS[idx]).classList.add('is-active');
      const it = gen.next();
      if (!it.done) {
        apply(it.value); idx++;
        if (animated) {
          // show a frame where something happens while the pipeline runs
          if (it.value.key === 'dff' && partial.dff) setFrame(brightestFrame(partial.dff));
          else setFrame(frame);
          timer = window.setTimeout(advance, pause);
        } else advance();
        return;
      }
      finish(it.value);
    };
    const finish = (d: Detection) => {
      det = d; running = false; runBtn.disabled = false;
      showComp = true; showThr = false; view = userView; setViewBtns();
      fill();
      const best = d.sparks.reduce<SparkDet | null>((a, b) => (!a || b.amp > a.amp ? b : a), null);
      sel = best ? best.id : -1;
      tbody.querySelectorAll('tr').forEach((r) => r.setAttribute('aria-selected', String(Number(r.dataset.id) === sel)));
      setFrame(frame);
      drawTrace();
      live.textContent = `Detection complete: ${d.sparks.length} sparks detected, ${d.found} of ${d.injected} injected sparks recovered, frequency ${d.frequency.toFixed(2)} per 100 square micrometres per second.`;
      if (!ctx.reduced) setPlaying(true);
    };
    if (animated) timer = window.setTimeout(advance, 30); else advance();
  }

  // ------------------------------------------------------------ events
  body.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (b) {
      if (b.dataset.act === 'run') run();
      if (b.dataset.act === 'regen') { seed = (Math.random() * 0xffff) | 0; regenerate(); }
      if (b.dataset.act === 'play') setPlaying(!playing);
      if (b.dataset.lut) {
        lutName = b.dataset.lut;
        body.querySelectorAll('[data-lut]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        drawImage();
      }
      if (b.dataset.view && !b.disabled) {
        view = userView = b.dataset.view as View; setViewBtns(); drawImage();
      }
      return;
    }
    const row = (e.target as Element).closest('tr[data-id]') as HTMLElement | null;
    if (row) select(Number(row.dataset.id), true);
  });
  tbody.addEventListener('keydown', (e) => {
    const row = (e.target as Element).closest('tr[data-id]') as HTMLElement | null;
    if (!row) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(Number(row.dataset.id), true); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      n?.focus();
    }
  });
  scrub.addEventListener('input', () => { setPlaying(false); setFrame(Number(scrub.value)); });
  stage.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); setPlaying(!playing); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setFrame(frame + (e.key === 'ArrowRight' ? 1 : -1)); }
  });
  stage.addEventListener('click', () => setPlaying(!playing));

  regenerate();
  return { run: (animated?: boolean, pause?: number) => run(animated, pause), focusTarget: () => runBtn };
}
