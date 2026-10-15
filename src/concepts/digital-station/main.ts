/**
 * Concept E — "Digital Research Station".
 * SPARK/OS: a fictional late-90s scientific workstation that is Gabriel's lab
 * desktop. Visitors explore by opening applications; SparkLab runs a real
 * (small) detection algorithm on a synthetic confocal line-scan.
 */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/vt323/400.css';
import '@fontsource/instrument-serif/400.css';
import './style.css';
import { mountChrome } from '../../shared/chrome';
import { prefersReducedMotion } from '../../shared/env';
import { person } from '../../shared/content';
import { WM, type AppDef } from './wm';
import { icons, logo } from './icons';
import { mountSparkLab, type SparkLabApi } from './sparklab';
import { mountTerminal, mountNotebook, mountProjects, mountAtlas, mountMail, mountAbout, esc } from './apps';
import { paintWallpaper } from './wallpaper';
import { generate, render } from './analysis';

mountChrome({ concept: 'Digital Research Station', status: 'SPARK/OS desktop · windows, terminal, synthetic SparkLab analysis' });
document.body.classList.add('ds');

const reduced = prefersReducedMotion();
const params = new URLSearchParams(location.search);
const mq = window.matchMedia('(max-width: 720px)');
const isMobile = () => mq.matches;

let spark: SparkLabApi | null = null;
let term: ReturnType<typeof mountTerminal> | null = null;

const APPS: AppDef[] = [
  { id: 'sparklab', title: 'SparkLab', file: 'SparkLab.app', blurb: 'Spark detection on a synthetic line-scan', x: 116, y: 18, w: 864, h: 694, mount: (b, c) => (spark = mountSparkLab(b, c)) },
  { id: 'terminal', title: 'Terminal', file: 'Terminal', blurb: 'Type help', x: 996, y: 268, w: 428, h: 400, mount: (b, c) => (term = mountTerminal(b, c)) },
  { id: 'notebook', title: 'Notebook', file: 'notebook/', blurb: 'Research themes', x: 300, y: 56, w: 760, h: 540, mount: (b) => mountNotebook(b) },
  { id: 'projects', title: 'Projects', file: 'projects/', blurb: 'File browser', x: 360, y: 110, w: 700, h: 470, mount: (b) => mountProjects(b) },
  { id: 'atlas', title: 'Atlas', file: 'atlas.map', blurb: 'Travel map', x: 220, y: 90, w: 860, h: 480, mount: (b) => mountAtlas(b) },
  { id: 'mail', title: 'Mail', file: 'contact.vcf', blurb: 'Contact', x: 520, y: 140, w: 620, h: 450, mount: (b) => mountMail(b) },
  { id: 'about', title: 'About This Station', file: 'README', blurb: 'Who runs this desk', x: 560, y: 70, w: 520, h: 560, mount: (b) => mountAbout(b) },
];

// ------------------------------------------------------------------ DOM
const wall = document.createElement('canvas');
wall.className = 'ds-wall';
wall.setAttribute('aria-hidden', 'true');

const main = document.createElement('main');
main.className = 'ds-screen';
main.setAttribute('aria-label', 'SPARK/OS desktop');
main.innerHTML = `
  <h1 class="vh">${esc(person.name)} — Digital Research Station</h1>
  <div class="ds-desk">
    <ul class="ds-icons" aria-label="Desktop">${APPS.map((a, i) => `<li><button type="button" class="ds-icon" data-open="${a.id}" aria-label="Open ${a.title} (Alt+${i + 1})">
      <span class="ds-icon-img">${icons[a.id]}</span><span class="ds-icon-label">${a.file}</span></button></li>`).join('')}</ul>
    <div class="ds-hello" aria-hidden="true"><span class="mono">STATION OWNER</span><b>${esc(person.name)}</b><span>${esc(person.role)}</span></div>
  </div>
  <section class="launcher" aria-label="Applications">
    <div class="launch-card">
      <span class="launch-logo">${logo}</span>
      <div><p class="mono">SPARK/OS 4.2</p><h2>${esc(person.name)}</h2><p>${esc(person.role)}</p></div>
      <p class="launch-tag">${esc(person.tagline)}</p>
    </div>
    <ul class="launch-grid">${APPS.map((a) => `<li><button type="button" data-open="${a.id}"><span class="ds-icon-img">${icons[a.id]}</span><span>${a.title.replace('About This Station', 'About')}</span></button></li>`).join('')}</ul>
    <button type="button" class="launch-widget" data-open="sparklab" aria-label="Open SparkLab: spark detection on a synthetic line-scan">
      <span class="lw-head"><b>SparkLab</b><span class="mono">synthetic_002A.lsm</span></span>
      <canvas width="720" height="192" aria-hidden="true"></canvas>
      <span class="lw-foot"><span>Detect calcium sparks on a synthetic confocal line-scan</span><span class="lw-go" aria-hidden="true">Run ›</span></span>
    </button>
    <p class="launch-note mono"><span class="led" aria-hidden="true"></span>synthetic data only</p>
  </section>
  <nav class="ds-dock" aria-label="Dock">
    <span class="dock-brand" aria-hidden="true">${logo}<b>SPARK/OS</b></span>
    <ul>${APPS.map((a, i) => `<li><button type="button" class="dock-btn" data-open="${a.id}" aria-label="${a.title} (Alt+${i + 1})" title="${a.title} — Alt+${i + 1}">
      ${icons[a.id]}<span class="dock-lbl">${a.title.replace('About This Station', 'About')}</span><i class="dock-run" aria-hidden="true"></i></button></li>`).join('')}</ul>
    <span class="dock-status mono"><span class="led" aria-hidden="true"></span>SYNTHETIC DATA</span>
  </nav>
  <div class="ds-crt" aria-hidden="true"></div>`;
document.body.prepend(wall);
document.body.append(main);

const desk = main.querySelector('.ds-desk') as HTMLElement;
const wm = new WM(desk, APPS, () => {
  document.body.classList.toggle('has-win', !!wm.active);
  main.querySelectorAll<HTMLButtonElement>('.dock-btn').forEach((b) => {
    b.classList.toggle('is-running', wm.isOpen(b.dataset.open!));
    b.classList.toggle('is-active', wm.active === b.dataset.open);
  });
}, reduced, isMobile);

main.addEventListener('click', (e) => {
  const b = (e.target as Element).closest('[data-open]') as HTMLElement | null;
  if (b) wm.open(b.dataset.open!);
});
window.addEventListener('ds:run-detection', () => spark?.run());

// ------------------------------------------------------------------ menu bar (shared chrome, themed)
const nav = document.querySelector('.gx-nav') as HTMLElement;
const brand = document.createElement('span');
brand.className = 'ds-brand';
brand.innerHTML = `<b>SPARK/OS</b><span>4.2</span>`;
nav.querySelector('.gx-home')!.after(brand);
const tray = document.createElement('div');
tray.className = 'ds-tray';
tray.innerHTML = `<button type="button" class="ds-crt-btn" aria-pressed="false" title="Toggle glass / CRT effect">Glass</button><span class="ds-clock mono" aria-hidden="true"></span>`;
nav.append(tray);
const SECTION_APP: Record<string, string> = { research: 'notebook', projects: 'projects', about: 'about', contact: 'mail' };
nav.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((b) => {
  b.setAttribute('aria-label', `${b.textContent} — opens ${wm.def(SECTION_APP[b.dataset.section!])?.title}`);
});
// Capture phase on the <nav>: route conventional nav to the matching app windows.
nav.querySelector('nav')!.addEventListener('click', (e) => {
  const b = (e.target as Element).closest('[data-section]') as HTMLElement | null;
  if (!b || !bootDone) return;
  e.stopPropagation();
  wm.open(SECTION_APP[b.dataset.section!]);
}, true);

const clock = tray.querySelector('.ds-clock') as HTMLElement;
const tick = () => { clock.textContent = new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }); };
tick(); setInterval(tick, 20000);

const crtBtn = tray.querySelector('.ds-crt-btn') as HTMLButtonElement;
let crt = !reduced;
try { const s = localStorage.getItem('ds-crt'); if (s !== null) crt = s === '1'; } catch { /* storage unavailable */ }
const setCrt = (on: boolean) => {
  crt = on;
  document.body.classList.toggle('crt-on', on);
  crtBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('ds-crt', on ? '1' : '0'); } catch { /* ignore */ }
};
setCrt(crt);
crtBtn.addEventListener('click', () => setCrt(!crt));

// mobile launcher preview (rendered lazily, only when the phone layout is shown)
let previewDone = false;
const preview = () => {
  if (previewDone || !isMobile()) return;
  previewDone = true;
  render(generate(42), (main.querySelector('.launch-widget canvas') as HTMLCanvasElement).getContext('2d')!, 'green');
};
preview();
mq.addEventListener('change', preview);
main.querySelector('.launch-widget')!.addEventListener('click', () => setTimeout(() => spark?.run(), reduced ? 0 : 250));

// ------------------------------------------------------------------ wallpaper
const paint = () => paintWallpaper(wall);
paint();
document.fonts?.ready.then(paint);
let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(paint, 150); });

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
  if (!bootDone) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.altKey && /^Digit[1-7]$/.test(e.code)) {
    e.preventDefault();
    wm.open(APPS[Number(e.code.slice(5)) - 1].id);
  } else if (e.key === 'Escape' && wm.active) {
    e.preventDefault();
    wm.close(wm.active);
  }
});

mq.addEventListener('change', () => {
  if (isMobile() && wm.active) { const keep = wm.active; for (const a of APPS) if (a.id !== keep) wm.close(a.id, false); }
});

// ------------------------------------------------------------------ boot
let bootDone = false;
function showDesktop() {
  if (bootDone) return;
  bootDone = true;
  document.body.classList.add('is-booted');
  if (!isMobile()) {
    wm.open('terminal', { focus: false });
    term?.exec('whoami');
    wm.open('sparklab', { focus: false });
    setTimeout(() => spark?.run(), reduced ? 0 : 350);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__conceptReady = true; }));
}

const skipBoot = reduced || params.has('skipboot');
if (skipBoot) {
  showDesktop();
} else {
  const boot = document.createElement('div');
  boot.className = 'ds-boot';
  boot.setAttribute('role', 'status');
  boot.setAttribute('aria-label', 'Starting SPARK/OS');
  boot.innerHTML = `<div class="boot-inner">
      <div class="boot-head">${logo}<div><b>SPARK/OS</b><span class="mono">4.2 “Ryanodine” · research workstation firmware</span></div></div>
      <pre class="boot-log mono"></pre>
      <div class="boot-bar"><i></i></div>
      <button type="button" class="boot-skip mono">Press any key to skip ›</button>
    </div>`;
  document.body.append(boot);
  const log = boot.querySelector('.boot-log') as HTMLElement;
  const bar = boot.querySelector('.boot-bar i') as HTMLElement;
  const lines: [string, string][] = [
    ['POST  memory check', 'ok'],
    ['POST  photomultiplier tube', 'simulated'],
    ['mount /research', 'ok'],
    ['mount /projects', '3 placeholders'],
    ['loading synthetic dataset  seed=0x002A', 'ok'],
    ['calibrating LUT  green · fire', 'ok'],
    ['starting window server', 'ok'],
  ];
  let i = 0;
  const timer = window.setInterval(() => {
    if (i < lines.length) {
      const [a, b] = lines[i];
      log.insertAdjacentHTML('beforeend', `<span>${a.padEnd(42, '.')} <em class="${b === 'ok' ? 'ok' : 'note'}">${b}</em></span>\n`);
      bar.style.width = `${((i + 1) / lines.length) * 100}%`;
      i++;
    } else finish();
  }, 150);
  const finish = () => {
    clearInterval(timer);
    window.removeEventListener('keydown', onKey, true);
    boot.classList.add('is-done');
    setTimeout(() => boot.remove(), 450);
    showDesktop();
  };
  const onKey = (e: KeyboardEvent) => { e.preventDefault(); finish(); };
  window.addEventListener('keydown', onKey, true);
  boot.addEventListener('pointerdown', finish);
}
