/** Map an HTML element onto an arbitrary screen-space quad with CSS matrix3d. */
type Pt = [number, number];

function solve(src: Pt[], dst: Pt[]): number[] {
  // 8×8 linear system for the projective transform src → dst
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {           // Gaussian elimination with partial pivoting
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8).fill(0);
  for (let r = 7; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return h;
}

/** corners in Blender plane vertex order: (-x,-y) (+x,-y) (-x,+y) (+x,+y), i.e. bl, br, tl, tr. */
export function fitQuad(el: HTMLElement, [bl, br, tl, tr]: [Pt, Pt, Pt, Pt]) {
  const w = el.offsetWidth || 640, h = el.offsetHeight || 480;
  const H = solve([[0, 0], [w, 0], [0, h], [w, h]], [tl, tr, bl, br]);
  el.style.transformOrigin = '0 0';
  el.style.transform = `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,1)`;
}
