/**
 * Direction B — The Research Archive.
 * Pre-rendered Cycles "plates" (blender/research_archive.py) shown as 2.5D
 * scenes: a depth plate drives per-pixel parallax, film grain and haze shimmer;
 * hotspots and the live CRT terminal are aligned from 3D-projected JSON.
 */
import * as THREE from 'three';
import '@fontsource/special-elite';
import '@fontsource/ibm-plex-sans-condensed/400.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/vt323';
import './style.css';
import { mountChrome, createLoader, openPanel } from '../../shared/chrome';
import { prefersReducedMotion, url } from '../../shared/env';
import { mountTerminal } from './terminal';
import { openCatalogue } from './catalogue';
import { fitQuad } from './homography';

type Pt = [number, number];
interface PlateMeta { spots: Record<string, Pt>; screens: Record<string, Pt[]>; aspect: number }

const SPOTS: Record<string, { label: string; note: string; act: () => void }> = {
  drawers: { label: 'Card catalogue', note: 'Research records', act: () => openCatalogue() },
  console: { label: 'Archivist console', note: 'Query the archive', act: () => go('console', 'console') },
  trolley: {
    label: 'Film trolley', note: 'Talks & presentations',
    act: () => openPanel({ title: 'Reels', html: '<p class="is-placeholder">[Placeholder] Recorded talks, posters and presentations will be catalogued here once provided.</p>' }),
  },
  ladder: { label: 'Library ladder', note: 'About · off the bench', act: () => openPanel('about') },
  window: { label: 'Window', note: 'Contact', act: () => openPanel('contact') },
  lighttable: {
    label: 'Light table', note: 'Imaging',
    act: () => openPanel({ title: 'Light table', html: '<p>Confocal microscopy and biomedical image analysis: segmentation and automated quantification of calcium signals with computer vision and deep learning.</p><p class="is-placeholder">[Placeholder] Example figures to be added from published / synthetic material only.</p>' }),
  },
  crt_left: { label: 'Phosphor monitor', note: 'Software projects', act: () => openPanel('projects') },
  back: { label: 'Back to the aisle', note: '', act: () => go('hall', 'console') },
};

const ok = mountChrome({ concept: 'The Research Archive', status: 'Cycles pre-rendered plates · 2.5D parallax · live CRT', needsWebGL: true });
let go: (plate: string, via?: string) => void = () => {};
if (ok) start();

async function start() {
  const reduced = prefersReducedMotion();
  const loader = createLoader('Opening the stacks');
  const meta: Record<string, PlateMeta> = await (await fetch(url('assets/renders/archive-plates.json'))).json();
  const tl = new THREE.TextureLoader();
  const load = (u: string) => new Promise<THREE.Texture>((res) => tl.load(u, res));
  const names = Object.keys(meta);
  let done = 0;
  const tex: Record<string, { color: THREE.Texture; depth: THREE.Texture }> = {};
  await Promise.all(names.map(async (n) => {
    const [color, depth] = await Promise.all([load(url(`assets/renders/archive-${n}.jpg`)), load(url(`assets/renders/archive-${n}-depth.jpg`))]);
    color.colorSpace = THREE.SRGBColorSpace;
    tex[n] = { color, depth };
    loader.progress(++done / names.length);
  }));

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.className = 'ra-canvas';
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uni = {
    colA: { value: tex.hall.color }, depA: { value: tex.hall.depth },
    colB: { value: tex.hall.color }, depB: { value: tex.hall.depth },
    mixAB: { value: 0 }, zoom: { value: 0 }, zoomAt: { value: new THREE.Vector2(0.5, 0.5) },
    cover: { value: new THREE.Vector2(1, 1) }, mouse: { value: new THREE.Vector2() },
    t: { value: 0 }, grain: { value: reduced ? 0 : 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D colA, depA, colB, depB; uniform float mixAB, zoom, t, grain;
      uniform vec2 zoomAt, cover, mouse; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      vec3 sampleP(sampler2D col, sampler2D dep, vec2 uv, float z){
        uv = (uv - .5) * cover + .5;                        // object-fit: cover
        uv = mix(uv, zoomAt, z);                            // dolly-in toward the hotspot
        float d = texture2D(dep, uv).r;
        vec2 par = mouse * (d - .35) * .018;                // depth-based parallax
        vec2 u2 = uv + par;
        float ca = .0012 * length(vUv - .5);                // subtle lens chromatic aberration
        return vec3(texture2D(col, u2 + vec2(ca,0)).r, texture2D(col, u2).g, texture2D(col, u2 - vec2(ca,0)).b);
      }
      void main(){
        vec3 a = sampleP(colA, depA, vUv, zoom * .55);
        vec3 b = sampleP(colB, depB, vUv, (1. - mixAB) * -.25);
        vec3 c = mix(a, b, smoothstep(0., 1., mixAB));
        // breathing haze: slow luminance shimmer in the bright volumetric areas
        float l = dot(c, vec3(.3,.6,.1));
        c *= 1. + .05 * sin(t * .7 + vUv.y * 6. + sin(vUv.x * 9. + t * .3)) * smoothstep(.15, .6, l);
        float v = smoothstep(1.15, .35, length((vUv - .5) * vec2(1.3, 1.)));
        c *= mix(.55, 1., v);
        c += (h(vUv * 917. + fract(t)) - .5) * .045 * grain;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  // ----- cover-fit mapping image space ↔ screen
  const IMG_AR = meta.hall.aspect;
  function updateCover() {
    const ar = innerWidth / innerHeight;
    uni.cover.value.set(ar > IMG_AR ? 1 : ar / IMG_AR, ar > IMG_AR ? IMG_AR / ar : 1);
  }
  const toScreen = ([x, y]: Pt): Pt => {
    const c = uni.cover.value;
    return [((x - 0.5) / c.x + 0.5) * innerWidth, ((y - 0.5) / c.y + 0.5) * innerHeight];
  };
  updateCover();

  // ----- hotspots
  const layer = document.createElement('div');
  layer.className = 'ra-spots';
  document.body.append(layer);
  let current = 'hall';
  const termEl = mountTerminal();
  function layout() {
    layer.innerHTML = '';
    const m = meta[current];
    const spots: [string, Pt][] = Object.entries(m.spots);
    if (current !== 'hall') spots.push(['back', [0.08, 0.86]]);
    for (const [key, p] of spots) {
      const s = SPOTS[key];
      if (!s) continue;
      const [x, y] = key === 'back' ? [p[0] * innerWidth, p[1] * innerHeight] : toScreen(p);
      const b = document.createElement('button');
      b.className = `ra-spot${key === 'back' ? ' is-back' : ''}`;
      b.style.transform = `translate(${x}px, ${y}px)`;
      b.innerHTML = key === 'back' ? `← ${s.label}` : `<span class="ra-tag"><b>${s.label}</b><i>${s.note}</i></span>`;
      b.addEventListener('click', () => s.act());
      layer.append(b);
    }
    // live terminal mapped onto the main CRT
    const scr = m.screens.crt_main;
    termEl.style.display = current === 'console' ? '' : 'none';
    if (current === 'console' && scr) fitQuad(termEl, scr.map(toScreen) as [Pt, Pt, Pt, Pt]);
  }

  // ----- plate transitions
  let tr: { t: number; to: string } | null = null;
  go = (plate: string, via = plate) => {
    if (tr || plate === current) return;
    const p = meta[current].spots[via] ?? [0.5, 0.5];
    const c = uni.cover.value;
    uni.zoomAt.value.set((p[0] - 0.5) * c.x + 0.5, 1 - ((p[1] - 0.5) * c.y + 0.5));
    uni.colB.value = tex[plate].color; uni.depB.value = tex[plate].depth;
    layer.classList.add('is-hidden');
    termEl.style.display = 'none';
    tr = { t: reduced ? 1 : 0, to: plate };
  };
  function finish(to: string) {
    current = to;
    uni.colA.value = tex[to].color; uni.depA.value = tex[to].depth;
    uni.mixAB.value = 0; uni.zoom.value = 0;
    tr = null;
    layer.classList.remove('is-hidden');
    document.body.dataset.plate = to;
    layout();
    if (to === 'console') termEl.querySelector('input')?.focus();
  }

  const target = new THREE.Vector2();
  addEventListener('pointermove', (e) => { if (!reduced) target.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); updateCover(); layout(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && current !== 'hall' && !document.querySelector('dialog[open], .ra-cat')) go('hall', 'console'); });

  const clock = new THREE.Clock();
  layout();
  document.body.dataset.plate = 'hall';
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    uni.t.value = clock.elapsedTime;
    uni.mouse.value.lerp(target, 0.05);
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / 1.6);
      uni.zoom.value = Math.min(1, tr.t * 1.4);
      uni.mixAB.value = Math.max(0, (tr.t - 0.35) / 0.65);
      if (tr.t >= 1) finish(tr.to);
    }
    renderer.render(scene, cam);
  });
  loader.done();
  window.__conceptReady = true;

  const card = document.createElement('div');
  card.className = 'ra-card';
  card.innerHTML = `<p class="ra-eyebrow">Accession No. GMR-0001 · Biomedical Engineering</p>
    <h1>The Research<br>Archive</h1>
    <p>Gabriel Manzano Reche — records of an investigation into the calcium life of heart cells.</p>`;
  document.body.append(card);
}
