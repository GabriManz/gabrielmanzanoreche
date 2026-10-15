/**
 * The window: night views of the cities Gabriel has lived in (rendered by
 * blender/city_views.py). The render camera looks horizontally along the hero
 * camera's line of sight through the window, so the image sits on a plane on
 * that line and cross-fades from city to city.
 */
import * as THREE from 'three';
import { url } from '../../shared/env';

export interface City { key: string; name: string; landmarks: string }

export const CITIES: City[] = [
  { key: 'baza', name: 'Baza', landmarks: 'Co-catedral de la Encarnación · Dama de Baza · Cascamorras' },
  { key: 'granada', name: 'Granada', landmarks: 'Alhambra · Sierra Nevada · Albaicín' },
  { key: 'madrid', name: 'Madrid', landmarks: 'Palacio Real · El Oso y el Madroño' },
  { key: 'barcelona', name: 'Barcelona', landmarks: 'Sagrada Família · Torre Glòries · Collserola' },
];

const LENS = 24, SENSOR = 36;          // must match blender/city_views.py
const DIST = 14;                        // plane distance along the line of sight (m)
const HOLD = 11, FADE = 2.4;            // seconds per city, cross-fade seconds

/** b2t: Blender (x, y, z) → three (x, z, -y). heroB / windowB in Blender coordinates. */
export function createCityWindow(
  scene: THREE.Scene,
  b2t: (x: number, y: number, z: number) => THREE.Vector3,
  heroB: [number, number, number],
  windowB: [number, number, number],
  opts: { reduced: boolean; onChange?: (c: City) => void },
) {
  const loader = new THREE.TextureLoader();
  const tex = CITIES.map((c) => {
    const t = loader.load(url(`assets/textures/window-${c.key}.jpg`));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: { a: { value: tex[0] }, b: { value: tex[0] }, k: { value: 0 }, t: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */`uniform sampler2D a, b; uniform float k, t; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 c = mix(texture2D(a, vUv).rgb, texture2D(b, vUv).rgb, smoothstep(0., 1., k));
        // a few lit windows switch off and on very slowly: the city is alive
        vec2 cell = floor(vUv*vec2(420.,210.));
        float flick = step(0.988, h(cell + floor(t*0.15 + h(cell)*10.)));
        c *= 1. - flick*smoothstep(.25,.6,dot(c, vec3(.3,.6,.1)))*.8;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
  // plane on the horizontal line of sight hero → window, at eye height (render camera is level)
  const dx = windowB[0] - heroB[0], dy = windowB[1] - heroB[1];
  const len = Math.hypot(dx, dy);
  const centre = b2t(heroB[0] + (dx / len) * DIST, heroB[1] + (dy / len) * DIST, heroB[2]);
  const w = 2 * DIST * (SENSOR / 2 / LENS);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), mat);
  mesh.position.copy(centre);
  mesh.lookAt(b2t(...heroB));
  scene.add(mesh);

  let i = 0, clock = 0, fading = -1, last = 0;
  const show = (next: number) => {
    // a click during a cross-fade finishes it immediately and moves on
    if (fading >= 0) { mat.uniforms.a.value = tex[i]; mat.uniforms.k.value = 0; fading = -1; }
    mat.uniforms.a.value = tex[i];
    i = (next + CITIES.length) % CITIES.length;
    mat.uniforms.b.value = tex[i];
    mat.uniforms.k.value = 0;
    fading = 0;
    clock = 0;
    opts.onChange?.(CITIES[i]);
  };
  queueMicrotask(() => opts.onChange?.(CITIES[0])); // after the caller finishes wiring up

  return {
    mesh,
    current: () => CITIES[i],
    next: () => show(i + 1),
    update(t: number) {
      // wall-clock timing (not the capped frame delta) so slow devices fade at the same pace
      const dt = Math.min(1, t - last);
      last = t;
      mat.uniforms.t.value = t;
      if (fading >= 0) {
        fading += dt / (opts.reduced ? 0.01 : FADE);
        mat.uniforms.k.value = Math.min(1, fading);
        if (fading >= 1) { fading = -1; mat.uniforms.a.value = tex[i]; mat.uniforms.k.value = 0; }
      } else if (!opts.reduced) {
        clock += dt;
        if (clock > HOLD) show(i + 1);
      }
    },
  };
}
