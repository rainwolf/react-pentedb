// Client-side symmetry dedup for the Branch-B fifth-move offers — a UX pre-check that mirrors
// the server's RenjuState.isSymmetricDuplicate (and the turn-based JSP renjuIsSymmetricDup in
// gameServer/tb/mobileGame.jsp). The server is authoritative; this just gives instant feedback.
// 15x15 board; move index = x + y*size.
//
// SHAPE-RELATIVE (placed-stone) symmetry — NOT centre-based. A candidate is a duplicate only if
// some symmetry of the CURRENT PLACED, COLOURED position maps it onto an already-offered point.
// The stabilizer is the set of affine maps g(p) = lin(p,r) + (tx,ty) (D4 linear part r plus an
// integer translation) that permute the placed set onto itself preserving colour. The translation
// is solved from the placed stones — we do NOT assume the symmetry fixes the board centre (the old
// centre-only code missed off-centre point/axis symmetries and wrongly offered mirror pairs as
// distinct). For an asymmetric opening the stabilizer is just {identity}, so only an EXACT
// duplicate is rejected; rotated/reflected offers stay legal. (Mirrors RENJU_ROTX/ROTY/ROTF +
// renjuStabilizer in the JSP and positionStabilizer()/applyTransform() in RenjuState.java.)

const SIZE = 15;
// The 8 D4 linear operations, identical to the server's tables and the JSP's RENJU_ROTX/Y/F.
const ROTX = [1, 1, 1, 1, -1, -1, -1, -1];
const ROTY = [1, 1, -1, -1, -1, -1, 1, 1];
const ROTF = [0, 1, 0, 1, 0, 1, 0, 1];

// Linear part of D4 operation r (0..7) applied to ABSOLUTE coords (no centre offset).
function lin(x, y, r) {
  let x1 = x * ROTX[r];
  let y1 = y * ROTY[r];
  if (ROTF[r]) { const t = x1; x1 = y1; y1 = t; }
  return [x1, y1];
}

// Image of `move` under the affine transform t = [r, tx, ty].
// Returns the destination board index, or sentinel -1 if off-board (guards row wraparound).
export function renjuApply(move, t, size = SIZE) {
  const [r, tx, ty] = t;
  const x = move % size;
  const y = Math.floor(move / size);
  const [lx, ly] = lin(x, y, r);
  const X = lx + tx;
  const Y = ly + ty;
  if (X < 0 || X >= size || Y < 0 || Y >= size) return -1;
  return X + Y * size;
}

// The affine transforms that map the current placed, COLOURED position onto itself — its
// stabilizer subgroup. Each transform is a triple [r, tx, ty]. `valueAt(move)` returns the board
// stone value at that point (0 = empty); equal positive values are the same colour.
export function renjuStabilizer(valueAt, size = SIZE) {
  const placed = [];
  for (let m = 0; m < size * size; m++) {
    const v = valueAt(m);
    if (v > 0) placed.push({x: m % size, y: Math.floor(m / size), c: v});
  }
  // Empty or single-stone shape: only the identity.
  if (placed.length === 0) return [[0, 0, 0]];

  const p0 = placed[0];
  const seen = new Set();
  const stab = [];
  for (let r = 0; r < 8; r++) {
    const [l0x, l0y] = lin(p0.x, p0.y, r);
    for (const q of placed) {
      if (q.c !== p0.c) continue;
      const tx = q.x - l0x;
      const ty = q.y - l0y;
      let ok = true;
      for (const p of placed) {
        const dst = renjuApply(p.x + p.y * size, [r, tx, ty], size);
        if (dst < 0 || valueAt(dst) !== p.c) { ok = false; break; }
      }
      if (ok) {
        const key = `${r},${tx},${ty}`;
        if (!seen.has(key)) { seen.add(key); stab.push([r, tx, ty]); }
      }
    }
  }
  return stab;
}

// True if `move` maps onto an already-offered point under some transform in `stab` (a precomputed
// stabilizer). Caller computes the stabilizer once per render and reuses it across candidates.
// The stabilizer is a group (closed, with inverses), so this one-directional check is complete.
// `offers` may be a Set (preferred — the caller builds it once per render) or an array (the test
// and isSymmetricDup pass arrays); arrays are wrapped once so both call styles work.
export function isOfferDup(move, offers, stab, size = SIZE) {
  const acc = offers instanceof Set ? offers : new Set(offers);
  return stab.some((t) => acc.has(renjuApply(move, t, size)));
}

// Convenience: compute the stabilizer from the placed position and test in one call.
export function isSymmetricDup(move, offers, valueAt, size = SIZE) {
  return isOfferDup(move, offers, renjuStabilizer(valueAt, size), size);
}
