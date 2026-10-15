/**
 * Direction A — The Signal Room.
 * A Blender-generated attic workspace (blender/signal_room.py). All lighting is
 * pre-computed in Cycles and baked into two lightmap atlases, so the browser
 * only draws unlit textured meshes: photographic light at real-time cost.
 */
import * as THREE from 'three';
import { loadGLTFJson } from '../../shared/gltf';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono';
import './style.css';
import { mountChrome, createLoader, openPanel, onPanelClose } from '../../shared/chrome';
import { person } from '../../shared/content';
import { prefersReducedMotion, isTouch, url } from '../../shared/env';
import { createScreen } from './screen';
import { openEyepiece } from './eyepiece';
import { leave } from '../../shared/transition';
import { CHAPTERS, pageUrl } from '../../shared/chapters';
import { openCatalogue } from '../../shared/catalogue';
import { createCityWindow, CITIES } from './cityWindow';

const EXPOSURE = 2.0; // must match blender/bake.py

type Spot = { label: string; kicker: string; open: () => void };
const SPOTS: Record<string, Spot> = {
  microscope: { label: 'Microscope', kicker: 'Chapter 1 · What is a spark', open: () => openEyepiece() },
  computer: { label: 'Workstation', kicker: 'Chapter 2 · How I measure it', open: () => {} }, // handled by enterScreen()
  notebook: { label: 'Research notebook', kicker: 'Records · publications', open: () => openCatalogue('BIBLIOGRAPHY') },
  poster: {
    label: 'Conference poster', kicker: 'Talks · posters',
    open: () => openPanel({ title: 'Conferences & presentations', html:
      `<p class="is-placeholder">[Placeholder] Posters and talks will be listed here once Gabriel provides them.</p>` }),
  },
  globe: {
    label: 'Globe', kicker: 'Travel',
    open: () => openPanel({ title: 'Elsewhere', html: `<p>Travelling and discovering new cultures.</p>
      <p class="is-placeholder">[Placeholder] Places and stories to be added by Gabriel.</p>` }),
  },
  shoes: { label: 'Running shoes', kicker: 'Endurance', open: () => openPanel('about') },
  kettlebell: { label: 'Kettlebell', kicker: 'CrossFit', open: () => openPanel('about') },
};

const ok = mountChrome({ concept: 'The Signal Room', status: 'Blender-baked scene · live screen · 7 hotspots', needsWebGL: true });
if (ok) start();

function start() {
  const reduced = prefersReducedMotion();
  const loader = createLoader('Switching on the desk lamp');
  document.querySelector('.gx-loader')?.setAttribute('style', `background:#050506 url(${url('assets/renders/signal-room-hero.jpg')}) center/cover`);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch() ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = 'sr-canvas';
  document.body.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050407);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 200);
  camera.filmGauge = 36;

  // Blender (x, y, z) → three (x, z, -y)
  const b2t = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
  const HERO = { pos: b2t(1.65, -1.7, 1.55), target: b2t(-0.45, 1.05, 1.0), focal: 21 };
  const HERO_PORTRAIT = { pos: b2t(1.2, -1.85, 1.45), target: b2t(-0.2, 1.2, 1.0), focal: 13 };
  const view = { pos: new THREE.Vector3(), target: new THREE.Vector3(), focal: 21 };
  const heroView = () => (innerWidth / innerHeight < 0.9 ? HERO_PORTRAIT : HERO);
  Object.assign(view, { pos: heroView().pos.clone(), target: heroView().target.clone(), focal: heroView().focal });

  // --- the window: night views of the cities Gabriel has lived in, cross-fading
  const caption = document.createElement('p');
  caption.className = 'sr-city';
  caption.setAttribute('aria-live', 'polite');
  document.body.append(caption);
  const cityWin = createCityWindow(scene, b2t, [1.65, -1.7, 1.55], [0, 1.89, 1.725], {
    reduced,
    onChange: (c) => {
      const n = CITIES.indexOf(c) + 1;
      caption.innerHTML = `<span>Places I've lived · ${n}/${CITIES.length}</span><b>${c.name}</b><i>${c.landmarks}</i>` +
        (c.key === 'barcelona' ? `<button class="sr-city-go">Watch Barcelona beat · Chapter 3 →</button>` : '');
      caption.querySelector('.sr-city-go')?.addEventListener('click', () => enterCity());
      caption.classList.remove('is-in'); void caption.offsetWidth; caption.classList.add('is-in');
      const w = anchors.find((a) => a.key === 'window');
      if (w) w.el.querySelector('i')!.textContent = `Places I've lived · ${c.name}`;
    },
  });

  // --- load the baked room
  const pickables: THREE.Mesh[] = [];
  const spotObjs: Record<string, THREE.Object3D> = {};
  let screenMesh: THREE.Mesh | null = null;
  const screen = createScreen();

  loadGLTFJson(url('assets/models/signal-room.gltf.json'), (p) => loader.progress(p)).then((gltf) => {
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      if (m.userData.lightmap) {
        m.material = new THREE.MeshBasicMaterial({ map: src.map, color: new THREE.Color(EXPOSURE, EXPOSURE, EXPOSURE) });
      } else if (m.name.startsWith('screen')) {
        m.material = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
        screenMesh = m;
      } else if (m.name.startsWith('lamp_bulb')) {
        m.material = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
      }
      if (m.userData.interactive) {
        spotObjs[m.name] = m;
        pickables.push(m);
      }
    });
    scene.add(gltf.scene);
    buildHotspots();
    loader.done();
    renderer.render(scene, camera);
    window.__conceptReady = true;
  }).catch((err) => {
    console.error(err);
    loader.done(); // never leave the visitor stuck behind the cover
    const msg = document.createElement('p');
    msg.className = 'sr-error';
    msg.innerHTML = `The 3D room could not load on this device. <a href="#gx-text">Read the text version</a> or use the menu above.`;
    document.body.append(msg);
    window.__conceptReady = true;
  });

  // --- dust motes drifting in the lamp's cone
  const dust = (() => {
    const n = reduced ? 0 : 140;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // inside the lamp's light cone, below the shade
      const h = Math.random(), r = (1 - h) * 0.22 * Math.sqrt(Math.random()), a = Math.random() * 6.283;
      p.set([0.6 + r * Math.cos(a), 0.8 + h * 0.4, -(1.2 + r * Math.sin(a))], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.0035, color: 0xffd7a0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(pts);
    return pts;
  })();

  // --- hotspots: HTML buttons projected onto 3D anchors (discoverable + keyboard accessible)
  const layer = document.createElement('div');
  layer.className = 'sr-hotspots';
  document.body.append(layer);
  const anchors: { el: HTMLButtonElement; p: THREE.Vector3; key: string }[] = [];

  function buildHotspots() {
    for (const [key, spot] of Object.entries(SPOTS)) {
      const o = spotObjs[key];
      if (!o) continue;
      const box = new THREE.Box3().setFromObject(o);
      const p = box.getCenter(new THREE.Vector3());
      p.y = box.max.y + 0.03;
      const el = document.createElement('button');
      el.className = 'sr-spot';
      el.innerHTML = `<span class="sr-dot"></span><span class="sr-label"><b>${spot.label}</b><i>${spot.kicker}</i></span>`;
      el.setAttribute('aria-label', `${spot.label} — ${spot.kicker}`);
      el.addEventListener('click', () => focusOn(key));
      el.addEventListener('mouseenter', () => setHover(key));
      el.addEventListener('mouseleave', () => setHover(null));
      el.addEventListener('focus', () => setHover(key));
      el.addEventListener('blur', () => setHover(null));
      layer.append(el);
      anchors.push({ el, p, key });
    }
    const wEl = document.createElement('button');
    wEl.className = 'sr-spot';
    wEl.innerHTML = `<span class="sr-dot"></span><span class="sr-label"><b>Window</b><i>Places I've lived · ${cityWin.current().name}</i></span>`;
    wEl.setAttribute('aria-label', "Window — show the next city I've lived in");
    wEl.addEventListener('click', () => cityWin.next());
    layer.append(wEl);
    anchors.push({ el: wEl, p: b2t(-0.65, 1.8, 2.25), key: 'window' });
  }

  // --- hover highlight (brighten baked material) + raycast picking
  let hovered: string | null = null;
  function setHover(key: string | null) {
    if (hovered === key) return;
    if (hovered) ((spotObjs[hovered] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setScalar(EXPOSURE);
    hovered = key;
    if (key) ((spotObjs[key] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setScalar(EXPOSURE * 1.45);
    renderer.domElement.style.cursor = key ? 'pointer' : '';
    anchors.forEach((a) => a.el.classList.toggle('is-hot', a.key === key));
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (e: PointerEvent) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(pickables, false)[0]?.object.name ?? null;
  };
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    if (e.pointerType === 'mouse') setHover(pick(e));
  });
  renderer.domElement.addEventListener('click', (e) => {
    const k = pick(e as PointerEvent);
    if (k) return focusOn(k);
    // clicking the view through the window advances to the next city
    if (ray.intersectObject(scene, true)[0]?.object === cityWin.mesh) cityWin.next();
  });

  // --- window → Chapter 3: push towards the glass, then drop into the excitable city
  function enterCity() {
    focused = 'window';
    document.body.classList.add('is-focused');
    const target = b2t(-0.2, 1.9, 1.75);
    flyThen({ pos: b2t(-0.05, 1.2, 1.7), target, focal: 22 }, () => leave(pageUrl(CHAPTERS[2].slug), { color: CHAPTERS[2].color }));
  }

  // --- camera flights
  let flight: { from: typeof view; to: typeof view; t: number; done?: () => void } | null = null;
  let focused: string | null = null;
  function flyTo(to: typeof view, done?: () => void) {
    const from = { pos: view.pos.clone(), target: view.target.clone(), focal: view.focal };
    flight = reduced ? null : { from, to, t: 0, done };
    if (reduced) { Object.assign(view, { pos: to.pos.clone(), target: to.target.clone(), focal: to.focal }); done?.(); }
  }
  /** Fly, then run `then` once the camera has arrived (with a safety timeout for slow devices). */
  function flyThen(to: typeof view, then: () => void) {
    let fired = false;
    const once = () => { if (!fired) { fired = true; then(); } };
    flyTo(to, once);
    setTimeout(once, 4000);
  }
  function enterScreen() {
    if (!screenMesh) return;
    focused = 'computer';
    document.body.classList.add('is-focused');
    const c = new THREE.Box3().setFromObject(screenMesh).getCenter(new THREE.Vector3());
    // the screen faces the room (+z in three); stop just in front of it, filling the view
    flyThen({ pos: c.clone().add(new THREE.Vector3(0, 0, innerWidth / innerHeight < 0.9 ? 0.75 : 0.42)), target: c, focal: 26 },
      () => leave(pageUrl(CHAPTERS[1].slug), { color: CHAPTERS[1].color }));
  }

  function focusOn(key: string) {
    if (key === 'computer') return enterScreen();
    const o = spotObjs[key];
    if (!o) return;
    focused = key;
    document.body.classList.add('is-focused');
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = heroView().pos.clone().sub(c).setY(0).normalize();
    const pos = c.clone().add(dir.multiplyScalar(Math.max(0.55, size * 1.6))).add(new THREE.Vector3(0, size * 0.45 + 0.1, 0));
    flyTo({ pos, target: c, focal: innerWidth / innerHeight < 0.9 ? 18 : 30 });
    setTimeout(() => SPOTS[key].open(), reduced ? 0 : 900);
  }
  function back() {
    focused = null;
    document.body.classList.remove('is-focused');
    const h = heroView();
    flyTo({ pos: h.pos.clone(), target: h.target.clone(), focal: h.focal });
  }
  onPanelClose(() => focused && back());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && focused && !document.querySelector('dialog[open]')) back(); });
  addEventListener('sr:eyepiece-closed', () => back());
  addEventListener('gx:catalogue-closed', () => focused && back());

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    if (!focused) { const h = heroView(); Object.assign(view, { pos: h.pos.clone(), target: h.target.clone(), focal: h.focal }); }
  });

  // --- loop
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  const sway = new THREE.Vector2();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.4);
      const k = ease(flight.t);
      view.pos.lerpVectors(flight.from.pos, flight.to.pos, k);
      view.target.lerpVectors(flight.from.target, flight.to.target, k);
      view.focal = THREE.MathUtils.lerp(flight.from.focal, flight.to.focal, k);
      if (flight.t >= 1) { const done = flight.done; flight = null; done?.(); }
    }
    if (!reduced) sway.lerp(mouse, 0.04);
    camera.position.copy(view.pos).add(tmp.set(sway.x * 0.08, -sway.y * 0.04, 0));
    camera.aspect = innerWidth / innerHeight;
    camera.setFocalLength(view.focal);
    camera.lookAt(view.target);
    cityWin.update(t);
    if (dust) {
      dust.rotation.y = Math.sin(t * 0.05) * 0.02;
      dust.position.y = Math.sin(t * 0.3) * 0.01;
    }
    if (screenMesh) screen.update(t);
    for (const a of anchors) {
      tmp.copy(a.p).project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
      a.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
      a.el.classList.toggle('is-off', !visible || (!!focused && a.key !== focused));
    }
    renderer.render(scene, camera);
  });

  // --- title card
  const card = document.createElement('div');
  card.className = 'sr-card';
  card.innerHTML = `<p class="sr-eyebrow">Barcelona · 41.39° N · after hours</p>
    <h1>${person.name}</h1>
    <p class="sr-tag">${person.tagline}</p>
    <p class="sr-hint">${isTouch() ? 'Tap' : 'Hover and click'} the objects on the desk — or use <kbd>Tab</kbd>.</p>`;
  document.body.append(card);
}
