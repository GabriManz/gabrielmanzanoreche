/**
 * Stylised Eixample layout (Cerdà grid). One world unit = one block pitch
 * (~133 m: 113 m block + 20 m street). Purely illustrative cartography.
 */
import type { SectionKey } from '../../shared/content';

export interface Block { x: number; z: number; h: number; seed: number; landmark?: SectionKey }
export interface Landmark { key: SectionKey; x: number; z: number; h: number }

export interface CityLayout {
  nbx: number; nbz: number;     // blocks across x / z
  C: number;                    // sim cells per block pitch
  nx: number; ny: number;       // sim grid
  blocks: Block[];
  landmarks: Landmark[];
  mask: Uint8Array;
  coast: (x: number) => number; // sea where z < coast(x)
  park: { x0: number; z0: number; x1: number; z1: number };
  diag: { ax: number; az: number; bx: number; bz: number };
  sa: { x: number; z: number };
  route: [number, number][];
  probe: [number, number];
}

function hash(i: number, j: number) {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return (Math.imul(h, 1103515245) >>> 0) / 4294967296;
}

export function buildCity(portrait: boolean, C: number): CityLayout {
  const nbx = portrait ? 12 : 24;
  const nbz = portrait ? 20 : 16;
  const W = nbx, H = nbz;
  const x0 = -W / 2, z0 = -H / 2;
  // The Mediterranean bites the far-left corner (the real coast runs diagonal to the grid).
  const coastA = portrait ? 3.6 : 4.6, coastB = portrait ? -6.5 : -7.4;
  const coast = (x: number) => z0 + coastA + coastB * ((x - x0) / W);
  // A non-conducting park (think Ciutadella) — an anatomical obstacle.
  const park = portrait
    ? { x0: x0 + 7, z0: z0 + 6, x1: x0 + 10, z1: z0 + 8 }
    : { x0: x0 + 16, z0: z0 + 3, x1: x0 + 19, z1: z0 + 5 };
  // Avinguda Diagonal, cutting the grid.
  const diag = portrait
    ? { ax: x0 - 1, az: z0 + H * 0.78, bx: x0 + W + 1, bz: z0 + H * 0.52 }
    : { ax: x0 - 1, az: z0 + H * 0.8, bx: x0 + W + 1, bz: z0 + H * 0.38 };
  const distDiag = (x: number, z: number) => {
    const dx = diag.bx - diag.ax, dz = diag.bz - diag.az;
    const L = Math.hypot(dx, dz);
    return Math.abs((x - diag.ax) * dz - (z - diag.az) * dx) / L;
  };
  const inPark = (x: number, z: number, m = 0) =>
    x > park.x0 - m && x < park.x1 + m && z > park.z0 - m && z < park.z1 + m;

  const sa = portrait ? { x: x0 + 2.5, z: z0 + 4.5 } : { x: x0 + 3.5, z: z0 + 5.5 };

  // Landmark (hotspot) blocks, as fractions of the grid.
  const lmFrac: [SectionKey, number, number][] = portrait
    ? [['research', 0.42, 0.36], ['projects', 0.8, 0.55], ['about', 0.25, 0.7], ['contact', 0.72, 0.86]]
    : [['research', 0.32, 0.4], ['projects', 0.62, 0.6], ['about', 0.4, 0.86], ['contact', 0.85, 0.75]];

  const blocks: Block[] = [];
  const valid: Block[] = [];
  for (let bj = 0; bj < nbz; bj++)
    for (let bi = 0; bi < nbx; bi++) {
      const x = x0 + bi + 0.5, z = z0 + bj + 0.5;
      if (z - 0.55 < coast(x)) continue;
      if (inPark(x, z, 0.2)) continue;
      if (distDiag(x, z) < 0.62) continue;
      if (Math.hypot(x - sa.x, z - sa.z) < 0.9) continue; // pacemaker plaza
      const r = hash(bi, bj);
      const b: Block = { x, z, h: 0.2 + r * r * 0.34 + (hash(bj, bi) > 0.93 ? 0.3 : 0), seed: r };
      blocks.push(b);
      valid.push(b);
    }
  const landmarks: Landmark[] = [];
  for (const [key, fx, fz] of lmFrac) {
    const tx = x0 + fx * W, tz = z0 + fz * H;
    let best = valid[0], bd = 1e9;
    for (const b of valid) {
      if (b.landmark) continue;
      const d = Math.hypot(b.x - tx, b.z - tz);
      if (d < bd) { bd = d; best = b; }
    }
    best.landmark = key;
    best.h = 0.78;
    landmarks.push({ key, x: best.x, z: best.z, h: best.h });
  }

  // Simulation mask (tissue = land that is not park).
  const nx = nbx * C, ny = nbz * C;
  const mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) / C, z = z0 + (j + 0.5) / C;
      mask[j * nx + i] = z > coast(x) + 0.08 && !inPark(x, z) ? 1 : 0;
    }

  // A long-run loop traced along street centre-lines (street lines are at integer offsets).
  const S = (i: number, j: number): [number, number] => [x0 + i, z0 + j];
  const route: [number, number][] = portrait
    ? [S(2, 7), S(2, 17), S(6, 17), S(6, 12), S(10, 12), S(10, 9), S(5, 9), S(5, 7), S(2, 7)]
    : [S(5, 6), S(5, 13), S(11, 13), S(11, 10), S(20, 10), S(20, 7), S(14, 7), S(14, 6), S(5, 6)];

  // ECG/heart-rate probe: a tissue cell near the middle.
  const probe: [number, number] = [Math.floor(nx * 0.5), Math.floor(ny * 0.62)];

  return { nbx, nbz, C, nx, ny, blocks, landmarks, mask, coast, park, diag, sa, route, probe };
}
