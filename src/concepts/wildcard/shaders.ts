/** GLSL for the night city. Field texture: R = u (excitation), G = v (recovery). */

const common = /* glsl */ `
uniform sampler2D uField;
uniform vec4 uCity;      // x0, z0, W, H
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFlash;    // defibrillation flash 0..1
const vec3 CYAN   = vec3(0.16, 0.78, 1.00);
const vec3 WHITE  = vec3(0.92, 1.00, 1.00);
const vec3 EMBER  = vec3(1.00, 0.27, 0.04);
const vec3 SODIUM = vec3(1.00, 0.62, 0.26);
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 fieldAt(vec2 xz){
  vec2 uv = (xz - uCity.xy) / uCity.zw;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return vec2(0.);
  return texture2D(uField, uv).rg;
}
// excitation colour ramp: cyan front → white-hot core
vec3 frontCol(float u){ return mix(CYAN, WHITE, smoothstep(0.93, 1.0, u) * 0.6); }
// v is stored /0.95 in the texture; the ember tail spans the absolute refractory period
float emberOf(float u, float v){ return smoothstep(0.05, 0.5, v) * (1. - smoothstep(0.3, 0.75, u)); }
float restOf(float v){ return 1. - smoothstep(0.015, 0.09, v); }
vec3 applyFog(vec3 col, vec3 wp){
  float d = length(wp - cameraPosition);
  float f = 1. - exp(-uFogDensity * uFogDensity * d * d);
  return mix(col, uFogColor, clamp(f, 0., 1.));
}
`;

export const blockVert = /* glsl */ `
uniform sampler2D uField;
uniform vec4 uCity;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vBlock;
varying vec2 vCenter;
varying float vH;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec4 c = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
  vCenter = c.xz;
  vec2 uv = (c.xz - uCity.xy) / uCity.zw;
  vBlock = texture2D(uField, uv).rg;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vH = instanceMatrix[1][1];
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const blockFrag = /* glsl */ `
${common}
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vBlock;
varying vec2 vCenter;
varying float vH;
void main(){
  vec2 fp = fieldAt(vWorld.xz);
  // each block is a "cell": mostly block-level state, a little sub-block sweep
  float u = mix(vBlock.r, fp.r, 0.6);
  float v = mix(vBlock.g, fp.g, 0.6);
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.35, 0.75, -0.55));
  float diff = max(dot(n, L), 0.);
  vec3 base = vec3(0.030, 0.038, 0.062);
  vec3 col = base * (0.35 + 1.4 * diff) + vec3(0.010, 0.014, 0.03);
  float ember = emberOf(u, v);
  float rest = restOf(v);
  float seed = hash12(vCenter * 7.13);
  if (n.y > 0.5) {
    // roof: flare with the front, smoulder in the tail
    col += frontCol(u) * u * 1.1;
    col += EMBER * ember * 0.30;
    col += SODIUM * 0.018 * rest;
    // landmark roof outline
    if (vH > 0.55) {
      vec2 q = abs(vWorld.xz - vCenter);
      float edge = smoothstep(0.37, 0.39, max(q.x, q.y)) + smoothstep(0.34, 0.33, max(q.x, q.y)) * 0.0;
      col += vec3(0.95, 0.9, 0.8) * edge * 0.55;
    }
  } else {
    // facades: rows of windows
    vec2 t = vec2(-n.z, n.x);
    float s = dot(vWorld.xz, t);
    float fy = vWorld.y / 0.052;
    float fx = s / 0.034;
    vec2 cell = vec2(floor(fx), floor(fy));
    vec2 f = fract(vec2(fx, fy));
    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78);
    win *= step(0.02, vWorld.y) * step(vWorld.y, vH - 0.03);
    float r = hash12(cell + seed * 91.7);
    float lit = step(0.62, r);
    vec3 warm = mix(SODIUM, vec3(1.0, 0.85, 0.6), step(0.9, r));
    vec3 w = warm * lit * 0.55 * rest;
    w += frontCol(u) * u * (0.45 + 1.0 * lit);
    w += EMBER * ember * (0.25 + 0.9 * lit);
    col += w * win;
    // ground contact darkening + street-light bounce from below
    float ao = smoothstep(0.0, 0.10, vWorld.y);
    col *= 0.55 + 0.45 * ao;
    col += (CYAN * u * 0.25 + EMBER * ember * 0.06 + SODIUM * 0.03 * rest) * (1. - ao);
  }
  col += vec3(0.75, 0.95, 1.0) * uFlash * 0.6;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
}`;

export const groundVert = /* glsl */ `
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const groundFrag = /* glsl */ `
${common}
uniform vec2 uCoast;   // z = z0 + A + B * (x - x0) / W
uniform vec4 uPark;    // x0 z0 x1 z1
uniform vec4 uDiag;    // ax az bx bz
varying vec3 vWorld;
float lampField(vec2 q, float spacing){
  // q in street-grid coordinates (streets on integer lines)
  vec2 g = abs(fract(q + 0.5) - 0.5);
  vec2 a = abs(fract(q * spacing + 0.5) - 0.5) / spacing;
  // lamps along vertical streets (g.x small) and horizontal streets (g.y small), both kerbs
  float d1 = length(vec2(abs(g.x - 0.045), a.y));
  float d2 = length(vec2(abs(g.y - 0.045), a.x));
  float d = min(d1, d2);
  return exp(-d * d * 9000.);
}
void main(){
  vec2 p = vWorld.xz;
  float zc = uCity.y + uCoast.x + uCoast.y * (p.x - uCity.x) / uCity.z;
  float sd = p.y - zc;
  vec2 q = p - uCity.xy;
  vec2 uv = q / uCity.zw;
  float inCity = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
  vec2 fv = fieldAt(p);
  float u = fv.r, v = fv.g;
  float ember = emberOf(u, v), rest = restOf(v);
  vec3 col;
  float dist = length(p - cameraPosition.xz);
  if (sd < 0.) {
    // the Mediterranean: ink water, faint swell and reflected promenade lights
    col = mix(vec3(0.010, 0.026, 0.050), vec3(0.004, 0.010, 0.022), clamp(-sd * 0.08, 0., 1.));
    float sw = sin(p.x * 3.1 + p.y * 1.7 + uTime * 0.6) * sin(p.x * 1.3 - p.y * 4.3 - uTime * 0.4);
    col += vec3(0.02, 0.04, 0.07) * (0.5 + 0.5 * sw) * 0.6;
    // moon path glinting on the swell
    float glint = pow(max(0., sin(p.y * 17. + sin(p.x * 5. + uTime * 0.8) * 1.5)), 12.) * exp(-abs(p.x - uCity.x - 2.) * 0.5);
    col += vec3(0.35, 0.5, 0.65) * glint * 0.12;
    float streak = smoothstep(0.55, 1.0, sin(p.x * 23.0 + sin(p.y * 9.0 + uTime) * 0.6) * 0.5 + 0.5);
    col += SODIUM * 0.10 * streak * exp(sd * 1.8);
    col += SODIUM * 0.28 * exp(-abs(sd) * 40.);
  } else {
    col = vec3(0.012, 0.014, 0.022);
    vec2 cq = max(max(-q, q - uCity.zw), 0.0);
    float near = exp(-length(cq) * 0.35);
    vec2 g = abs(fract(q + 0.5) - 0.5);
    float dStreet = min(g.x, g.y);
    float street = 1. - smoothstep(0.065, 0.08, dStreet);
    // Diagonal avenue
    vec2 da = uDiag.zw - uDiag.xy;
    float dd = abs((p.x - uDiag.x) * da.y - (p.y - uDiag.y) * da.x) / length(da);
    float diag = 1. - smoothstep(0.16, 0.19, dd);
    street = max(street, diag);
    col = mix(col, vec3(0.030, 0.036, 0.056), street * inCity);
    float lamps = lampField(q, 5.0);
    // lamps on the Diagonal's central promenade
    float along = dot(p - uDiag.xy, normalize(da));
    float dl = length(vec2(dd - 0.07, (fract(along * 4.0) - 0.5) / 4.0));
    lamps = max(lamps, exp(-dl * dl * 9000.) * diag);
    if (inCity > 0.5) {
      float park = step(uPark.x, p.x) * step(p.x, uPark.z) * step(uPark.y, p.y) * step(p.y, uPark.w);
      if (park > 0.5) {
        col = vec3(0.010, 0.026, 0.022);
        float tr = hash12(floor(p * 18.));
        col += vec3(0.02, 0.06, 0.04) * step(0.7, tr);
        lamps *= 0.0;
        // border path lights
        vec2 e = min(abs(p - uPark.xy), abs(p - uPark.zw));
        lamps += exp(-min(e.x, e.y) * min(e.x, e.y) * 3000.) * step(0.5, fract((p.x + p.y) * 6.)) * 0.6;
      }
      vec3 glow = SODIUM * 0.55 * rest + frontCol(u) * u * 2.4 + EMBER * ember * 1.6;
      col += lamps * glow;
      col += street * (CYAN * u * 0.45 + EMBER * ember * 0.16);
      col += (CYAN * u * 0.16 + EMBER * ember * 0.035) * (1. - park);
    } else {
      // the rest of the metropolis, fading into the haze
      float h = hash12(floor(p * 5.0));
      col += lamps * SODIUM * 0.22 * step(0.6, h) * (0.15 + 0.85 * near);
    }
    // seafront promenade
    col += SODIUM * 0.5 * exp(-sd * 30.);
  }
  col += vec3(0.6, 0.85, 1.0) * uFlash * 0.25 * inCity;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
}`;
