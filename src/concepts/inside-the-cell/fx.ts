import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Deep indigo void. */
export const VOID = new THREE.Color('#05041a');

/**
 * Calcium "fire" lookup table (black → deep red → orange → yellow → white-hot),
 * in the spirit of the classic ImageJ "Fire" LUT used on Fluo-4 confocal data.
 * Returns linear HDR colour; values above 1 push into bloom.
 */
export const GLSL_FIRE = /* glsl */ `
vec3 fireLUT(float v) {
  v = clamp(v, 0.0, 1.4);
  vec3 c = vec3(0.0);
  c += vec3(0.55, 0.02, 0.10) * smoothstep(0.0, 0.25, v);   // deep crimson
  c += vec3(0.75, 0.16, 0.00) * smoothstep(0.15, 0.5, v);   // red-orange
  c += vec3(0.50, 0.55, 0.05) * smoothstep(0.4, 0.8, v);    // orange-yellow
  c += vec3(0.60, 0.70, 0.75) * smoothstep(0.75, 1.25, v);  // white-hot
  return c * (0.6 + 1.6 * v);
}
`;

/** Membrane / structure stain: cyan-green. */
export const GLSL_STAIN = /* glsl */ `
const vec3 STAIN = vec3(0.10, 0.85, 0.70);
const vec3 STAIN_DEEP = vec3(0.10, 0.30, 0.85);
`;

/** Soft "bokeh" dust that fakes depth of field: out-of-focus motes grow and dim. */
export function makeDust(count: number, box: THREE.Vector3, focus: number, seed = 1, tint = new THREE.Color('#5fe0d0')) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const a = new Float32Array(count);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (r() - 0.5) * box.x;
    p[i * 3 + 1] = (r() - 0.5) * box.y;
    p[i * 3 + 2] = (r() - 0.5) * box.z;
    a[i] = r();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(a, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uFocus: { value: focus }, uScale: { value: 1 },
      uTint: { value: tint }, uWarm: { value: new THREE.Color('#ff7a3a') },
    },
    vertexShader: /* glsl */ `
      attribute float aRand; uniform float uTime, uFocus, uScale;
      varying float vA; varying float vR;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.07 + aRand * 40.0) * 0.6;
        p.y += cos(uTime * 0.05 + aRand * 23.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        float blur = abs(d - uFocus) / uFocus;
        float size = (1.5 + aRand * 2.5) * (1.0 + blur * 9.0);
        gl_PointSize = min(size * uScale * 50.0 / d, 70.0 * uScale);
        vA = (0.35 + 0.65 * aRand) / (1.0 + blur * blur * 10.0);
        vR = aRand;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint, uWarm; varying float vA; varying float vR;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = dot(q, q);
        if (r > 1.0) discard;
        float disc = smoothstep(1.0, 0.75, r) * (0.55 + 0.45 * smoothstep(0.6, 1.0, r)); // bokeh ring
        vec3 col = mix(uTint, uWarm, step(0.86, vR));
        gl_FragColor = vec4(col * disc * vA * 0.09, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

/** Final grade: zoom blur during scale dives, chromatic fringe, vignette, grain, fade. */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uZoom: { value: 0 },
    uVoid: { value: VOID.clone() },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFade, uZoom, uAspect; uniform vec3 uVoid;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      vec3 col;
      if (uZoom > 0.001) {
        col = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float s = 1.0 - uZoom * 0.06 * float(i);
          col += texture2D(tDiffuse, 0.5 + c * s).rgb;
        }
        col /= 8.0;
      } else {
        float ca = 0.0025 * dot(c, c) * 4.0;
        col.r = texture2D(tDiffuse, vUv + c * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - c * ca).b;
      }
      vec2 cv = c * vec2(uAspect, 1.0);
      float vig = smoothstep(1.15, 0.25, length(cv) * 1.05);
      col = mix(uVoid * 0.6, col, 0.35 + 0.65 * vig);
      col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.025;
      col = mix(col, uVoid * 0.5, uFade);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

/** Soft-compress HDR highlights before bloom so stacked additive particles can't blow out the frame. */
const CompressShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uKnee: { value: 2.2 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uKnee; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      c = max(c, 0.0);
      float m = max(c.r, max(c.g, c.b));
      if (m > 1.0) { float e = m - 1.0; c *= (1.0 + e / (1.0 + e / uKnee)) / m; }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function makePipeline(renderer: THREE.WebGLRenderer, w: number, h: number, mobile: boolean) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), mobile ? 0.7 : 0.75, 0.55, 0.62);
  const final = new ShaderPass(FinalShader);
  composer.addPass(renderPass);
  composer.addPass(new ShaderPass(CompressShader));
  composer.addPass(bloom);
  composer.addPass(final);
  composer.addPass(new OutputPass());
  return { composer, renderPass, bloom, final };
}
