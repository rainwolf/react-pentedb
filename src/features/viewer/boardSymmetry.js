// Pure VIEW-only board symmetry transforms — the dihedral group of the square (8 elements).
// Operates on FLAT cell indices (cell = y*n + x) of an n x n board. These NEVER touch the
// stored move tree: BoardPane uses them only to render a rotated/reflected VIEW of the board
// and to map a click on that view back to the stored (canonical) orientation. Because rotation
// and reflection are symmetries of every board variant's rules, replaying the symmetry-mapped
// move list yields the same board (and identical capture counts) up to the transform.

export const SYMMETRY_COUNT = 8;

// (x,y) under symmetry `s` on an n x n grid. s in 0..3 = rotate 90° CCW `s` times;
// s in 4..7 = horizontal mirror, then rotate 90° CCW (s-4) times. Together these enumerate
// all 8 elements of D4 without repetition (verified in viewer.test.js).
export function symXY(x, y, n, s) {
  let px = x;
  let py = y;
  if (s >= 4) px = n - 1 - px; // horizontal mirror first
  const r = ((s % 4) + 4) % 4;
  for (let k = 0; k < r; k++) {
    const nx = py;
    const ny = n - 1 - px;
    px = nx;
    py = ny;
  }
  return [px, py];
}

// Canonical flat cell -> its displayed flat cell under symmetry `s`.
export function symCell(cell, s, n) {
  const x = cell % n;
  const y = Math.floor(cell / n);
  const [px, py] = symXY(x, y, n, s);
  return py * n + px;
}

// Map every canonical move to its displayed cell (used to build the rotated view board).
export function symMoves(moves, s, n) {
  return (moves || []).map((m) => symCell(m, s, n));
}

// Displayed flat cell -> canonical flat cell (inverse of symCell). D4 is small; we recover the
// preimage by scanning the (≤361-cell) board once, which is correct for every element without a
// hand-derived inverse table and only runs on an actual click, never per render.
export function invSymCell(displayCell, s, n) {
  for (let c = 0; c < n * n; c++) {
    if (symCell(c, s, n) === displayCell) return c;
  }
  return displayCell;
}
